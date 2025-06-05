/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.mycompany.mortalcombatlite.Acts;

import com.mycompany.mortalcombatlite.Heros.Hero;

/**
 *
 * @author nyaku
 */
public class Debuff extends Act {

    @Override
    public String getType() {
        return "Debuff";
    }

    @Override
    public void realisation(Hero hero1, Hero hero2, String hero2ActionType) {
        switch (hero2ActionType) {
            case "Hit" -> {
            }
            case "Block" -> {
                if (Math.random()<0.75){
                    hero2.setMovesWithDebuff(hero1.getLevel());
                }
            }
            case "Debuff" -> {
            }
            case "Heal" -> {
            }
        }
    }
}
